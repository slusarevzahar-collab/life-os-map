export function TopNav({ canBack, onBack, onCenter, apiState, errorCount, onErrors }) {
  return (
    <header className={`topNav ${canBack ? 'canNavigate' : 'homeNav'}`} onClick={(event) => event.stopPropagation()}>
      <div className="topTitle">
        <span className="brand"><b>Life</b><strong>Map</strong></span>
        <em>· {apiState}</em>
      </div>
      {canBack ? <button className="backButton" onClick={onBack}>← Назад</button> : null}
      {canBack ? (
        <div className="topActions">
          <button className="centerButton" onClick={onCenter}>Главная</button>
          {errorCount ? <button className="errorButton hasErrors" onClick={onErrors}>Ошибки {errorCount}</button> : null}
        </div>
      ) : errorCount ? (
        <div className="topActions homeErrors">
          <button className="errorButton hasErrors" onClick={onErrors}>Ошибки {errorCount}</button>
        </div>
      ) : null}
    </header>
  );
}
