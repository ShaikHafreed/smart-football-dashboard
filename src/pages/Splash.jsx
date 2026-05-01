import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    setTimeout(() => {
      navigate("/login");
    }, 2000);
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <h1 className="text-2xl font-bold">⚽ Smart Football</h1>
    </div>
  );
}