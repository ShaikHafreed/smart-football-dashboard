export default function FootballField({ speed, kick }) {

  const x = Math.min(speed * 5, 500);

  return (
    <div className="bg-green-500 h-64 rounded-xl relative overflow-hidden border-4 border-white shadow">

      {/* CENTER LINE */}
      <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-white"></div>

      {/* BALL */}
      <div
        className={`absolute w-6 h-6 bg-black rounded-full top-1/2 transition-all duration-500
        ${kick ? "scale-125" : ""}`}
        style={{
          left: `${x}px`,
          transform: "translateY(-50%)",
        }}
      />
    </div>
  );
}