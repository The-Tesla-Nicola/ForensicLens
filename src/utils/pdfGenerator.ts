import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { REPORT_STYLES, generateCaseId } from './reportTemplates';

export interface PDFData {
  classification: string;
  aiLikelihood: number;
  realLikelihood: number;
  editedLikelihood: number;
  consistencyScore: number;
  confidenceLevel: string;
  keyEvidence: string[];
  detectedIssues: string[];
  forensicSummary: string;
  finalVerdict: string;
  mostLikelySource: string;
  filename?: string;
  hash?: string;
}

export function generateForensicReport(data: PDFData, imageBase64?: string): jsPDF {
  const doc = new jsPDF();
  const caseId = generateCaseId();
  const date = new Date().toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short'
  });

  // PAGE 1: HEADER
  doc.setFillColor(...REPORT_STYLES.darkBg);
  doc.rect(0, 0, REPORT_STYLES.pageWidth, REPORT_STYLES.headerHeight, 'F');

  doc.setTextColor(...REPORT_STYLES.primaryColor);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('FORENSICTRACE', REPORT_STYLES.margin, 22);

  doc.setTextColor(...REPORT_STYLES.textColor);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Digital Image Forensics & Analysis Report', REPORT_STYLES.margin, 30);
  doc.text(`Case: ${caseId}`, REPORT_STYLES.margin, 35);

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${date}`, REPORT_STYLES.pageWidth - REPORT_STYLES.margin, 35, { align: 'right' });

  // PAGE 1: IMAGE
  let yPos = REPORT_STYLES.headerHeight + 10;
  if (imageBase64) {
    try {
      doc.addImage(imageBase64, 'JPEG', REPORT_STYLES.margin, yPos, 80, 60);
      yPos += 70;
    } catch (e) {
      yPos += 5;
    }
  }

  // PAGE 1: VERDICT TABLE
  const verdictBg =
    data.classification === 'AI-generated' ? REPORT_STYLES.redColor :
    data.classification === 'Real' ? REPORT_STYLES.greenColor :
    REPORT_STYLES.yellowColor;

  autoTable(doc, {
    startY: yPos,
    body: [
      [
        {
          content: `CLASSIFICATION: ${data.classification.toUpperCase()}`,
          styles: {
            fillColor: verdictBg,
            textColor: [255, 255, 255],
            fontSize: 14,
            fontStyle: 'bold',
            halign: 'center',
          },
          colSpan: 2,
        }
      ],
      [
        { content: 'Confidence Level', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: data.confidenceLevel.toUpperCase(), styles: { fontSize: 8 } },
      ],
      [
        { content: 'AI Likelihood', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.aiLikelihood}%`, styles: { fontSize: 8 } },
      ],
      [
        { content: 'Real Likelihood', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.realLikelihood}%`, styles: { fontSize: 8 } },
      ],
      [
        { content: 'Edited Likelihood', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.editedLikelihood}%`, styles: { fontSize: 8 } },
      ],
      [
        { content: 'Consistency Score', styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `${data.consistencyScore}%`, styles: { fontSize: 8 } },
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: REPORT_STYLES.lightBg },
    margin: { left: REPORT_STYLES.margin, right: REPORT_STYLES.margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // PAGE 1: SOURCE
  if (data.mostLikelySource) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_STYLES.textColor);
    doc.text('Likely Source:', REPORT_STYLES.margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(data.mostLikelySource, REPORT_STYLES.margin + 35, yPos);
    yPos += 10;
  }

  // PAGE 1: FORENSIC SUMMARY
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Forensic Summary', REPORT_STYLES.margin, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const summaryLines = doc.splitTextToSize(data.forensicSummary, REPORT_STYLES.pageWidth - 2 * REPORT_STYLES.margin);
  doc.text(summaryLines, REPORT_STYLES.margin, yPos);
  yPos += summaryLines.length * 5 + 10;

  // PAGE 2: EVIDENCE / ISSUES
  doc.addPage();
  yPos = REPORT_STYLES.margin;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...REPORT_STYLES.primaryColor);
  doc.text('Supporting Evidence & Detected Issues', REPORT_STYLES.margin, yPos);
  yPos += 10;

  doc.setTextColor(...REPORT_STYLES.textColor);
  data.keyEvidence.forEach((ev, i) => {
    doc.setFontSize(8);
    doc.setTextColor(...REPORT_STYLES.greenColor);
    doc.text('\u2713', REPORT_STYLES.margin, yPos);
    doc.setTextColor(...REPORT_STYLES.textColor);
    doc.text(ev, REPORT_STYLES.margin + 5, yPos);
    yPos += 5;
  });

  yPos += 5;
  data.detectedIssues.forEach((issue, i) => {
    doc.setFontSize(8);
    doc.setTextColor(...REPORT_STYLES.redColor);
    doc.text('!', REPORT_STYLES.margin, yPos);
    doc.setTextColor(...REPORT_STYLES.textColor);
    doc.text(issue, REPORT_STYLES.margin + 5, yPos);
    yPos += 5;
  });

  yPos += 10;

  // PAGE 2: FINAL VERDICT
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...REPORT_STYLES.primaryColor);
  doc.text('Final Verdict', REPORT_STYLES.margin, yPos);
  yPos += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...REPORT_STYLES.textColor);
  const verdictLines = doc.splitTextToSize(data.finalVerdict, REPORT_STYLES.pageWidth - 2 * REPORT_STYLES.margin);
  doc.text(verdictLines, REPORT_STYLES.margin, yPos);

  // PAGE 3: INTEGRITY
  doc.addPage();
  yPos = REPORT_STYLES.margin;

  doc.setFillColor(...REPORT_STYLES.darkBg);
  doc.rect(0, 0, REPORT_STYLES.pageWidth, 20, 'F');
  doc.setTextColor(...REPORT_STYLES.primaryColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATION & INTEGRITY', REPORT_STYLES.margin, 14);
  yPos = 30;

  const integrityData = [
    ['Case ID', caseId],
    ['Analysis Date', date],
    ['File Hash (SHA-256)', data.hash || 'Not available'],
    ['Classification', data.classification],
    ['Confidence', data.confidenceLevel],
    ['System', 'ForensicTrace v2.4.0 / Gemini 2.0 Flash'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Field', 'Value']],
    body: integrityData,
    theme: 'striped',
    headStyles: { fillColor: REPORT_STYLES.lightBg, textColor: REPORT_STYLES.primaryColor },
    margin: { left: REPORT_STYLES.margin, right: REPORT_STYLES.margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Chain of custody
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Chain of Custody', REPORT_STYLES.margin, yPos);
  yPos += 7;

  const custodyLog = [
    ['Action', 'Timestamp', 'System'],
    ['File Ingested', date, 'ForensicTrace v2.4.0'],
    ['Metadata Extracted', date, 'ForensicTrace v2.4.0'],
    ['AI Analysis (Gemini)', date, 'Gemini 2.0 Flash'],
    ['Report Generated', date, 'ForensicTrace v2.4.0'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Action', 'Timestamp', 'System']],
    body: custodyLog.slice(1),
    theme: 'striped',
    headStyles: { fillColor: REPORT_STYLES.lightBg, textColor: REPORT_STYLES.primaryColor },
    margin: { left: REPORT_STYLES.margin, right: REPORT_STYLES.margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Disclaimer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'italic');
  const disclaimer = 'This report is generated for research and investigative purposes only. '
    + 'It should not be used as sole evidence in legal proceedings without independent verification. '
    + 'The accuracy of AI-generated content detection is probabilistic and not guaranteed.';
  const discLines = doc.splitTextToSize(disclaimer, REPORT_STYLES.pageWidth - 2 * REPORT_STYLES.margin);
  doc.text(discLines, REPORT_STYLES.margin, yPos);

  // Watermark every page
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(`FORENSICTRACE \u2014 ${caseId}`, REPORT_STYLES.pageWidth - REPORT_STYLES.margin, REPORT_STYLES.pageHeight - 10, { align: 'right' });
    doc.text(`Page ${i}`, REPORT_STYLES.margin, REPORT_STYLES.pageHeight - 10);
  }

  return doc;
}
