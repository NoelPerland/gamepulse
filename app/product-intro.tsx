export default function ProductIntro() {
  return (
    <section className="product-intro" aria-label="About GamePulse">
      <p className="intro-brand">GamePulse</p>
      <h1>Understand the play. Improve the game.</h1>
      <p className="intro-description">
        See where players keep going and where they stop. Turn game events into
        clear signals about sessions, progression and friction.
      </p>
      <a className="intro-action" href="#workspace">
        Explore the analytics demo ↗
      </a>
      <p className="intro-note">
        The demo uses fictional sessions. Real ingestion and configuration
        changes require your developer keys.
      </p>
      <ol>
        <li>Explore the labeled demo sessions</li>
        <li>Inspect deaths, progression and next-day returns</li>
        <li>Connect your game through the API or Unity example</li>
      </ol>
      <a href="#workspace">Continue to workspace ↓</a>
    </section>
  );
}
