import PDFDocument from 'pdfkit-table'; // re-exports everything from pdfkit — used here for PDFDocument class only
import type {
    Order,
    Organization,
    Customer,
    Product
} from '../generated/prisma/client.js';

type PDFDoc = PDFDocument;

/** Raw Prisma shape returned by getInvoiceData — prices are Decimal, relations can be null */
interface InvoiceData {
    order: Order & {
        orderItems: {
            id: string;
            quantity: number;
            price: unknown; // Prisma Decimal
            product: Product | null;
        }[];
        customer: Customer | null;
    };
    organization: Organization;
}

/**
 * Fetch a remote image and return it as a Buffer.
 * Returns null if the fetch fails or the content-type is not an image.
 */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch {
        return null;
    }
}

/**
 * Format a number for display (e.g., "1,234.56") — no currency symbol.
 */
const fmtNum = (n: number): string =>
    n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

/**
 * Format a number with currency (e.g., "1,234.56 EGP").
 */
const fmtCurr = (n: number, currency: string): string =>
    `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

// ─── Layout Constants ───
const MARGIN = 50;
const PAGE_WIDTH = 595; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 495
const FOOTER_Y = 750;

const COLORS = {
    primary: '#1F2937',
    accent: '#3B82F6',
    muted: '#6B7280',
    border: '#E5E7EB',
    lightBg: '#F9FAFB',
    white: '#FFFFFF'
};

export async function generateInvoice(data: InvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Run the full generation in a catch-able inner async
        generateContent(doc, data).catch((err) => {
            try {
                doc.end();
            } catch {
                // ignore end() errors — we're already in an error path
            }
            reject(err);
        });
    });
}

async function generateContent(doc: PDFDoc, data: InvoiceData): Promise<void> {
    const { order, organization } = data;
    const orgSettings = (organization.settings ?? {}) as Record<
        string,
        unknown
    >;
    const currency = order.currency || 'EGP';

    // ─── Header: Logo + Company Info ───
    const logoUrl =
        organization.logo ?? (orgSettings?.logoUrl as string | undefined);
    const logoImage = logoUrl ? await fetchImageBuffer(logoUrl) : null;

    if (logoImage) {
        doc.image(logoImage, MARGIN, 45, { width: 60, height: 60 });
    }

    const companyNameX = logoImage ? 130 : MARGIN;
    doc.fillColor(COLORS.primary)
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(organization.name, companyNameX, 48, {
            width: 545 - companyNameX,
            align: 'left'
        });

    const companyDetails: string[] = [];
    const address = (orgSettings?.address as string) || '';
    const phone = (orgSettings?.phone as string) || '';
    const email = (orgSettings?.email as string) || '';
    if (address) companyDetails.push(address);
    if (phone) companyDetails.push(phone);
    if (email) companyDetails.push(email);

    if (companyDetails.length > 0) {
        doc.fillColor(COLORS.muted)
            .fontSize(9)
            .font('Helvetica')
            .text(companyDetails.join('\n'), companyNameX, 76, {
                width: 545 - companyNameX,
                align: 'left',
                lineGap: 2
            });
    }

    // ─── Divider ───
    drawDivider(doc, 120);

    // ─── Invoice Title & Details ───
    const invoiceNumber = order.externalId || order.id;

    doc.fillColor(COLORS.accent)
        .fontSize(26)
        .font('Helvetica-Bold')
        .text('INVOICE', MARGIN, 140);

    doc.fillColor(COLORS.primary)
        .fontSize(10)
        .font('Helvetica')
        .text(`Invoice #${invoiceNumber}`, MARGIN, 172);

    // Right: Invoice metadata box
    const metaX = 350;
    const metaY = 140;
    doc.rect(metaX, metaY, 195, 55).fill(COLORS.lightBg);

    doc.fillColor(COLORS.primary)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('INVOICE DETAILS', metaX + 10, metaY + 8);

    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica');

    const invoiceDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const orderDate = order.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const labelX = metaX + 10;
    const valX = metaX + 85;
    doc.text('Invoice Date:', labelX, metaY + 24);
    doc.text(invoiceDate, valX, metaY + 24);
    doc.text('Order Date:', labelX, metaY + 36);
    doc.text(orderDate, valX, metaY + 36);
    doc.text('Currency:', labelX, metaY + 48);
    doc.text(currency, valX, metaY + 48);

    doc.fillColor(COLORS.primary).font('Helvetica');

    drawDivider(doc, 215); // ─── Bill To Section ───
    const customer = order.customer;
    const customerName = customer?.name ?? '—';
    doc.fillColor(COLORS.primary)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Bill To', MARGIN, 235);

    const billToDetails: string[] = [customerName];
    if (customer?.email) billToDetails.push(customer.email);
    if (customer?.phone) billToDetails.push(customer.phone);
    if (customer?.address) billToDetails.push(customer.address);
    if (customer?.city) billToDetails.push(customer.city);

    doc.fillColor(COLORS.primary)
        .fontSize(9)
        .font('Helvetica')
        .text(billToDetails.join('\n'), MARGIN, 254, {
            lineGap: 2
        });

    // ─── Order Summary box (right) ───
    const summaryX = 350;
    doc.rect(summaryX, 235, 195, 65).fill(COLORS.lightBg);

    doc.fillColor(COLORS.primary)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('ORDER SUMMARY', summaryX + 10, 243);

    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica');

    const subtotal = Number(order.subtotal ?? 0);
    const discount = Number(order.discountAmount ?? 0);
    const tax = Number(order.taxAmount ?? 0);
    const shipping = Number(order.shippingAmount ?? 0);
    const total = Number(order.totalAmount ?? 0);

    // Right-aligned values within the box: position at mid-point of box, span the rest
    const sumLabelX = summaryX + 10;
    const sumValX = summaryX + 95; // 255px from summaryX, leaving 100px for value
    const sumValWidth = 90;

    let rowY = 258;
    doc.text('Subtotal:', sumLabelX, rowY);
    doc.text(fmtNum(subtotal), sumValX, rowY, {
        align: 'right',
        width: sumValWidth
    });
    rowY += 11;

    if (discount > 0) {
        doc.text('Discount:', sumLabelX, rowY);
        doc.text(`-${fmtNum(discount)}`, sumValX, rowY, {
            align: 'right',
            width: sumValWidth
        });
        rowY += 11;
    }

    doc.text('Tax:', sumLabelX, rowY);
    doc.text(fmtNum(tax), sumValX, rowY, {
        align: 'right',
        width: sumValWidth
    });
    rowY += 11;

    doc.text('Shipping:', sumLabelX, rowY);
    doc.text(fmtNum(shipping), sumValX, rowY, {
        align: 'right',
        width: sumValWidth
    });

    drawDivider(doc, 320);

    // ─── Items Table ───
    let tableTop = 340;

    // Table Header
    const colWidths = [225, 65, 95, 110] as const; // Product, Qty, Unit Price, Total
    const colStarts: [number, number, number, number] = [MARGIN, 0, 0, 0];
    for (let i = 1; i < colWidths.length; i++) {
        colStarts[i] = colStarts[i - 1]! + colWidths[i - 1]!;
    }

    const headers = ['Product', 'Qty', 'Unit Price', 'Total'];
    const headerHeight = 24;
    const rowHeight = 22;

    // Check if we need a page break before the table
    const estimatedTableHeight =
        headerHeight + order.orderItems.length * rowHeight + 100; // +100 for totals
    if (tableTop + estimatedTableHeight > FOOTER_Y) {
        doc.addPage();
        tableTop = MARGIN;
    }

    // Draw table header
    doc.rect(MARGIN, tableTop, CONTENT_WIDTH, headerHeight).fill(COLORS.accent);

    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9);
    headers.forEach((header, i) => {
        doc.text(header, colStarts[i]! + 8, tableTop + 7, {
            width: colWidths[i]! - 16,
            align: i === 0 ? 'left' : 'right'
        });
    });

    doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9);

    // Table rows
    let rowTop = tableTop + headerHeight;

    for (let index = 0; index < order.orderItems.length; index++) {
        const item = order.orderItems[index]!;
        const unitPrice = Number(item.price);
        const itemTotal = unitPrice * item.quantity;

        // Check page break before each row
        if (rowTop + rowHeight + 60 > FOOTER_Y) {
            // Not enough space for this row + totals + footer — new page
            // Re-draw table header on new page
            doc.addPage();

            // Continue table header on new page
            doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, headerHeight).fill(
                COLORS.accent
            );
            doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9);
            headers.forEach((header, i) => {
                doc.text(header, colStarts[i]! + 8, MARGIN + 7, {
                    width: colWidths[i]! - 16,
                    align: i === 0 ? 'left' : 'right'
                });
            });
            doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9);

            rowTop = MARGIN + headerHeight;
        }

        // Alternate row background
        if (index % 2 === 1) {
            doc.rect(MARGIN, rowTop, CONTENT_WIDTH, rowHeight).fill(
                COLORS.lightBg
            );
        }

        doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9);

        const productName = item.product?.name ?? '—';
        doc.text(productName, colStarts[0] + 8, rowTop + 6, {
            width: colWidths[0] - 16,
            align: 'left'
        });

        doc.text(item.quantity.toString(), colStarts[1] + 8, rowTop + 6, {
            width: colWidths[1] - 16,
            align: 'right'
        });

        doc.text(fmtNum(unitPrice), colStarts[2] + 8, rowTop + 6, {
            width: colWidths[2] - 16,
            align: 'right'
        });

        doc.fillColor(COLORS.primary)
            .font('Helvetica-Bold')
            .text(fmtNum(itemTotal), colStarts[3] + 8, rowTop + 6, {
                width: colWidths[3] - 16,
                align: 'right'
            });
        doc.font('Helvetica');

        rowTop += rowHeight;
    }

    // Table bottom border
    drawDivider(doc, rowTop);

    // ─── Totals Section ───
    // Ensure totals fit on current page
    if (rowTop + 120 > FOOTER_Y) {
        doc.addPage();
        rowTop = MARGIN;
    }

    const totalsX = 350;
    let totalsY = rowTop + 15;

    const lineItems = [
        { label: 'Subtotal', value: subtotal, bold: false },
        ...(discount > 0
            ? [{ label: 'Discount', value: -discount, bold: false }]
            : []),
        { label: 'Tax', value: tax, bold: false },
        { label: 'Shipping', value: shipping, bold: false }
    ];

    doc.fontSize(10);
    lineItems.forEach((item) => {
        doc.fillColor(COLORS.primary)
            .font(item.bold ? 'Helvetica-Bold' : 'Helvetica')
            .text(item.label, totalsX, totalsY);
        doc.text(fmtCurr(item.value, currency), totalsX + 120, totalsY, {
            align: 'right',
            width: 75
        });
        totalsY += 18;
    });

    // Total (highlighted)
    totalsY += 4;
    doc.rect(totalsX, totalsY, 195, 30).fill(COLORS.accent);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text('Total Due', totalsX + 12, totalsY + 8);
    doc.text(fmtCurr(total, currency), totalsX + 12, totalsY + 8, {
        align: 'right',
        width: 171
    });

    // ─── Footer (on each page) ───
    // pdfkit doesn't have native page footer support, so we add it on
    // the current page. For multi-page invoices this only shows on the last page.
    addFooter(doc);

    doc.end();
}

function drawDivider(doc: PDFDoc, y: number) {
    doc.strokeColor(COLORS.border)
        .lineWidth(1)
        .moveTo(MARGIN, y)
        .lineTo(545, y)
        .stroke();
}

function addFooter(doc: PDFDoc) {
    drawDivider(doc, FOOTER_Y - 10);
    doc.fillColor(COLORS.muted)
        .fontSize(8)
        .font('Helvetica')
        .text('Thank you for your business!', MARGIN, FOOTER_Y, {
            align: 'center',
            width: CONTENT_WIDTH
        });
}
