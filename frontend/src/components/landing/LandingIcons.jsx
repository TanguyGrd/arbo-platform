const iconPaths = {
  chart: "M4 19V5m0 14h16M8 15l3-4 3 2 4-6",
  certificate: "M7 3h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Zm4 5h4m-6 4h8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  euro: "M18 7.5A7 7 0 1 0 18 16.5M4 10h10M4 14h9",
  filter: "M4 5h16M7 12h10m-7 7h4",
  leaf: "M5 21c7.5-.5 14-6 14-15V3h-3C7 3 3 8 3 15c0 2 1 4 2 6Zm0 0c1.5-4 4.5-7 9-9",
  map: "M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Zm0 0V3m6 18V6",
  menu: "M4 7h16M4 12h16M4 17h16",
  plus: "M12 5v14M5 12h14",
  search: "m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z",
  shield: "M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z",
  tree: "M12 21v-7m0 0a5 5 0 1 0-4-8 4 4 0 1 1 8 0 5 5 0 1 0-4 8Zm-5 7h10",
  x: "M6 6l12 12M18 6 6 18",
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
