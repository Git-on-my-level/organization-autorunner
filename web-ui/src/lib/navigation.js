export const navigationItems = [
  {
    label: "Inbox",
    href: "/inbox",
    icon: "inbox",
  },
  {
    label: "Threads",
    href: "/threads",
    icon: "threads",
  },
  {
    label: "Artifacts",
    href: "/artifacts",
    icon: "artifacts",
  },
];

export function isKnownSection(pathname) {
  return navigationItems.some((item) => pathname === item.href);
}
