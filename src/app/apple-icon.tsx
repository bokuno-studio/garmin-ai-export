import { createAppIconResponse } from "./app-icon-image";

export const alt = "Garmin AI Export";
export const contentType = "image/png";
export const size = {
  width: 180,
  height: 180,
};

export default function AppleIcon() {
  return createAppIconResponse(size);
}
