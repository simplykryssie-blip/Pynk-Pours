import "server-only";
import QRCode from "qrcode";

/**
 * QR codes for tickets. The code holds only the random ticket credential:
 * no name, email or database id. Error correction "M" survives a scuffed screen.
 */
const OPTS = { errorCorrectionLevel: "M" as const, margin: 2 };

export async function qrPng(data: string, width = 480): Promise<Buffer> {
  return QRCode.toBuffer(data, { ...OPTS, type: "png", width, color: { dark: "#000000", light: "#ffffff" } });
}

export async function qrSvg(data: string): Promise<string> {
  return QRCode.toString(data, { ...OPTS, type: "svg", color: { dark: "#000000", light: "#ffffff" } });
}
