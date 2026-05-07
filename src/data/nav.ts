export const nav = [
  { label: 'Books', link: '/#books' },
  { label: 'Reviews', link: '/reviews' },
  { label: 'Flowchart', link: '/reviews/flowchart' },
  { label: 'Tutorials', link: '/tutorials' },
  { label: 'Blog', link: '/blogs' },
  { label: 'Artists', link: '/artists' },
  { label: 'Courses', link: '/#courses' },
  { label: 'CV', link: '/static/resume/Samuel_Hinton_CV.pdf' },
] as const;

export type NavItem = (typeof nav)[number];
