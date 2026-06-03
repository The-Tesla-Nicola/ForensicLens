export const REPORT_STYLES = {
  primaryColor: [242, 125, 38] as [number, number, number],
  darkBg: [5, 5, 5] as [number, number, number],
  lightBg: [20, 20, 20] as [number, number, number],
  textColor: [228, 227, 224] as [number, number, number],
  greenColor: [34, 197, 94] as [number, number, number],
  redColor: [239, 68, 68] as [number, number, number],
  yellowColor: [234, 179, 8] as [number, number, number],
  pageWidth: 210,
  pageHeight: 297,
  margin: 15,
  headerHeight: 40,
};

export function generateCaseId(): string {
  return `FG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}
