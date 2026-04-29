export default function Home() {
  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-2xl font-bold">Welcome 👋</h1>
        <p className="text-muted-foreground">
          Track and analyze your football performance
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="p-5 rounded-xl bg-card border">
          <p className="text-sm text-muted-foreground">Kick Force</p>
          <h2 className="text-2xl font-bold mt-2">-- N</h2>
        </div>

        <div className="p-5 rounded-xl bg-card border">
          <p className="text-sm text-muted-foreground">Ball Speed</p>
          <h2 className="text-2xl font-bold mt-2">-- km/h</h2>
        </div>

        <div className="p-5 rounded-xl bg-card border">
          <p className="text-sm text-muted-foreground">Spin Rate</p>
          <h2 className="text-2xl font-bold mt-2">-- RPM</h2>
        </div>

      </div>
    </div>
  );
}