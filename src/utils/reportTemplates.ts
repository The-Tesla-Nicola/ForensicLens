export const REPORT_STYLES = {
  primaryColor: [242, 125, 38] as [number, number, number],
  darkBg: [30, 30, 30] as [number, number, number],
  lightBg: [240, 240, 240] as [number, number, number],
  textColor: [20, 20, 20] as [number, number, number],
  greenColor: [22, 163, 74] as [number, number, number],
  redColor: [220, 38, 38] as [number, number, number],
  yellowColor: [202, 138, 4] as [number, number, number],
  pageWidth: 210,
  pageHeight: 297,
  margin: 15,
  headerHeight: 40,
};

export function generateCaseId(): string {
  return `FG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}
