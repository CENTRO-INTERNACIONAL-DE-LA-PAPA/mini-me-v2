import { cn } from "@/lib/utils";

/** Avatars narrower than this, in pixels, only blink and play the working animation. */
export const SMALL_AVATAR = 40;

/** The classes the avatar animations in `index.css` key on. */
export const avatarClass = (size: number, working = false) =>
  cn("avatar", size < SMALL_AVATAR && "avatar-small", working && "avatar-working");

/** A negative animation delay, so avatars shown together blink and breathe out of step. */
export const randomDelay = () => `${(-Math.random() * 6).toFixed(2)}s`;

/** Plays the click hop on `avatar` from its start, even if a hop is still playing. */
export function hop(avatar: HTMLElement) {
  avatar.classList.remove("avatar-hop");
  // Reading layout between the two class changes makes the browser restart the animation.
  void avatar.offsetWidth;
  avatar.classList.add("avatar-hop");
  avatar.addEventListener("animationend", () => avatar.classList.remove("avatar-hop"), {
    once: true,
  });
}
