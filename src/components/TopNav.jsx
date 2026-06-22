export function TopNav({ canBack, onBack, onCenter, apiState, errorCount, onErrors }) {
  return (
    <header className="topNav" onClick={(event) => event.stopPropagation()}>
      <div className="topTitle">
        <span className="brand"><b>Life</b><strong>Map</strong></span>
        <em>· {apiState}</em>
      </div>
      <button className="backButton" onClick={onBack} disabled={!canBack}>← Назад</button>
      <div className="topActions">
        <button className="centerButton" onClick={onCenter}>Главная</button>
        {errorCount ? <button className="errorButton hasErrors" onClick={onErrors}>Ошибки {errorCount}</button> : null}
      </div>
    </header>
  );
}
