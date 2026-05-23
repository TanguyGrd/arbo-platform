const iconPaths = {
  map: "M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Zm0 0V3m6 18V6",
  leaf: "M5 21c7.5-.5 14-6 14-15V3h-3C7 3 3 8 3 15c0 2 1 4 2 6Zm0 0c1.5-4 4.5-7 9-9",
  euro: "M18 7.5A7 7 0 1 0 18 16.5M4 10h10M4 14h9",
  search: "m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z",
  filter: "M4 5h16M7 12h10m-7 7h4",
  certificate: "M7 3h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Zm4 5h4m-6 4h8",
  shield: "M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z",
  report: "M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M8 16h8M8 12h5",
  chain: "M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1",
  handshake: "M8 12 5 9l4-4 4 4m3 0 3-3 3 3-4 4m-9-1 4 4 6-6m-5 5 2 2a2 2 0 0 0 3-3",
  plus: "M12 5v14M5 12h14",
};

function LandingIcon({ name, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export default LandingIcon;
