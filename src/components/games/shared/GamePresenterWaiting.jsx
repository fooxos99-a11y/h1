const GamePresenterWaiting = ({ error = '' }) => (
  <main className="game-presenter-waiting" dir="rtl">
    <div>
      <span className="game-presenter-waiting-dot" />
      <h1>شاشة المقدم جاهزة</h1>
      <p>بانتظار بدء اللعبة من شاشة العرض.</p>
      {error ? <strong>{error}</strong> : null}
    </div>
  </main>
);

export default GamePresenterWaiting;
