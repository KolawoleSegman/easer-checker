import { useState, useRef, useEffect } from "react";

interface Message {
  userId: string;
  username: string;
  message?: string;
  audio?: string;
  timestamp: Date;
  type: "text" | "voice";
}

interface ChatBoxProps {
  socket: any;
  gameId: string;
  userId: string;
  username: string;
}

const ChatBox = ({ socket, gameId, userId, username }: ChatBoxProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const onChat = (data: any) => {
      setMessages((prev) => [...prev, { ...data, type: "text" }]);
    };
    const onVoice = (data: any) => {
      setMessages((prev) => [...prev, { ...data, type: "voice" }]);
    };

    socket.on("chat_message", onChat);
    socket.on("voice_message", onVoice);

    return () => {
      socket.off("chat_message", onChat);
      socket.off("voice_message", onVoice);
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    socket.emit("chat_message", {
      gameId,
      userId,
      username,
      message: input.trim(),
    });
    setInput("");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          socket.emit("voice_message", {
            gameId,
            userId,
            username,
            audio: base64Audio,
          });
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied or not available");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playVoice = (audioBase64: string) => {
    const audio = new Audio(audioBase64);
    audio.play();
  };

  return (
    <div className="flex flex-col h-80 bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.userId === userId ? "items-end" : "items-start"}`}
          >
            <span className="text-xs text-gray-400">{msg.username}</span>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                msg.userId === userId
                  ? "bg-primary-500/30 text-white"
                  : "bg-white/10 text-gray-200"
              }`}
            >
              {msg.type === "text" ? (
                msg.message
              ) : (
                <button
                  onClick={() => playVoice(msg.audio!)}
                  className="flex items-center gap-2 text-yellow-300 hover:text-yellow-200 transition"
                >
                  <span>🔊</span> Play Voice
                </button>
              )}
            </div>
            <span className="text-[10px] text-gray-500 mt-0.5">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2 border-t border-white/10 flex items-center gap-2 bg-white/5">
        <form onSubmit={sendMessage} className="flex-1 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-primary-500/30 hover:bg-primary-500/50 rounded-lg text-white text-sm transition"
          >
            Send
          </button>
        </form>

        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`px-3 py-2 rounded-lg text-sm transition flex items-center gap-1 ${
            isRecording
              ? "bg-red-500/50 hover:bg-red-500/70 text-white animate-pulse"
              : "bg-white/10 hover:bg-white/20 text-gray-300"
          }`}
        >
          {isRecording ? "⏹️" : "🎤"}
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
