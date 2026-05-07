import { Link } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="w-64 bg-blue-700 text-white min-h-screen p-5">
      <h1 className="text-xl font-bold mb-8">⚽ Smart Ball</h1>

      <nav className="space-y-4">
        <Link to="/dashboard" className="block hover:bg-blue-500 p-2 rounded">
          Dashboard
        </Link>

        <Link to="/players" className="block hover:bg-blue-500 p-2 rounded">
          Players
        </Link>

        <Link to="/session" className="block hover:bg-blue-500 p-2 rounded">
          Session
        </Link>

        <Link to="/history" className="block hover:bg-blue-500 p-2 rounded">
          History
        </Link>
      </nav>
    </div>
  );
}