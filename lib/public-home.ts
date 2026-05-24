export type HomeCallToAction = {
  href: string;
  label: string;
};

export function getHomeCallToAction(isSignedIn: boolean): HomeCallToAction {
  if (isSignedIn) {
    return {
      href: "/",
      label: "Go find the bad parts",
    };
  }

  return {
    href: "/sign-in",
    label: "I don't mind.",
  };
}
