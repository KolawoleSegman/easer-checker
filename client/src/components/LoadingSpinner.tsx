const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center gap-4 p-12">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-primary-500/20 rounded-full animate-spin border-t-primary-500" />
      <div
        className="absolute inset-0 w-16 h-16 border-4 border-accent-500/20 rounded-full animate-spin border-t-accent-500"
        style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
      />
    </div>
    <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
  </div>
);

export default LoadingSpinner;
