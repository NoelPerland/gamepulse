export default function ProductIntro() {
  return (
    <section className="product-intro" aria-label="About GamePulse">
      <h1>Where did the run end?</h1>
      <p className="intro-description">
        Follow session starts, deaths and level clears. Filter by day to find where players got stuck.
      </p>
      <a className="intro-action" href="#workspace">
        Open the console ↗
      </a>
      <p className="intro-note">
        {process.env.NEXT_PUBLIC_VERCEL_ENV
          ? "Synthetic sessions. This hosted preview is read-only; source includes authenticated ingestion and remote configuration."
          : "Sample sessions are synthetic. Live ingestion and configuration need developer keys."}
      </p>
    </section>
  );
}
