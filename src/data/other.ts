// Misc external links section on the home page (`<Other />`). Originally
// a Hugo-era `data/other.yml`; this typed copy is now the source of truth.
export const other = [
  {
    "name": "CV",
    "link": "/static/resume/HintonOnePage.pdf",
    "desc": "If you're a recruiter or just curious about the way I'm meandering through life, heres my one page CV."
  },
  {
    "name": "Artists",
    "link": "/artists",
    "desc": "For shouting out great artists that make covers in the progression fantasy and LitRPG genre."
  }
] as const;

export default other;
