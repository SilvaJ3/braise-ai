export default function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden style={{ marginTop: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton" key={i} style={{ width: i % 3 === 2 ? '55%' : '100%' }} />
      ))}
    </div>
  )
}
