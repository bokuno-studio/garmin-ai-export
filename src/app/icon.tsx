import { createAppIconResponse } from "./app-icon-image";

export const alt = "Garmin AI Export";
export const contentType = "image/png";
export const size = {
  width: 512,
  height: 512,
};

export default function Icon() {
  return createAppIconResponse(size);
}
