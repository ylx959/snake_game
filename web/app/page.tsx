import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <h1 className="page__title">Snake</h1>
      <p className="page__lede">
        A C++ game server owns the board. The browser only draws what it is told.
      </p>
      <Link className="page__cta" href="/game">
        Play
      </Link>
    </main>
  );
}
