import { useNavigate } from "react-router-dom";

const History = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto glass p-8">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-4xl font-bold text-white mb-6">
          History of Checkers
        </h1>
        <div className="prose prose-invert max-w-none text-gray-300 space-y-4">
          <p>
            Checkers, also known as <strong>Draughts</strong> (pronounced
            "drafts"), is one of the oldest board games in the world. The game
            has been played for over 5,000 years, with archaeological evidence
            tracing its origins to ancient Mesopotamia.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-6">Origins</h2>
          <p>
            The earliest known form of draughts was found in the ancient city of
            Ur (modern‑day Iraq), dating back to around 3000 BC. The game spread
            to ancient Egypt, where a similar game called <em>Alquerque</em> was
            played on a 5×5 board.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-6">Evolution</h2>
          <p>
            The modern version of checkers emerged in Europe during the 16th
            century. The game was standardised in the 19th century, with the
            10×10 board (International Draughts) becoming popular in the
            Netherlands, France, and other European countries. The 8×8 variant
            (American checkers) became the standard in the United Kingdom and
            the United States.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-6">
            Why "Checkers" and "Draughts"?
          </h2>
          <p>
            The name <strong>"Checkers"</strong> comes from the word
            "checkered", referring to the pattern of the board. In British
            English, the game is called <strong>"Draughts"</strong>, which comes
            from the verb "to draw" or "to move", reflecting the movement of the
            pieces.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-6">
            Nigerian Draughts
          </h2>
          <p>
            Nigerian Draughts is played on a 10×10 board with flying kings and
            mandatory captures. It is a fast‑paced, strategic variant that is
            deeply rooted in Nigerian culture, often played in villages,
            schools, and gatherings.
          </p>
          <p>
            Today, checkers/draughts is enjoyed by millions worldwide, from
            casual players to professional competitors, with world championships
            held regularly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default History;
