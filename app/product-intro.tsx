export default function ProductIntro() {
  return (
    <section className="product-intro" aria-label="About GamePulse">
      <h1>Understand the play. Improve the game.</h1>
      <p className="intro-description">
        Inspect sessions, deaths, progression and next-day returns from game events.
      </p>
      <a className="intro-action" href="#workspace">
        Explore the analytics demo ↗
      </a>
      <p className="intro-note">
        The demo uses fictional sessions. Real ingestion and configuration
        changes require your developer keys.
      </p>
    </section>
  );
}
