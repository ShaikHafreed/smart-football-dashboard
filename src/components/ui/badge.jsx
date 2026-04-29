export function Badge({ children }) {
  return (
    <span
      style={{
        padding: "4px 8px",
        background: "#eee",
        borderRadius: "6px",
        fontSize: "12px",
      }}
    >
      {children}
    </span>
  );
}