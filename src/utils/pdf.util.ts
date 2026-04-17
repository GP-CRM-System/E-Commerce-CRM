import PDFDocument from 'pdfkit-table';
import type {
    Order,
    Organization,
    Customer,
    OrderItem,
    Product
} from '../generated/prisma/client.js';

interface InvoiceData {
    order: Order & {
        orderItems: (OrderItem & { product: Product })[];
        customer: Customer;
    };
    organization: Organization;
}

export async function generateInvoice(data: InvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const { order, organization } = data;
        const orgSettings = organization.settings as Record<string, unknown>;

        // Header
        if (orgSettings?.logoUrl) {
            // In a real app, we'd fetch and embed the image
            // doc.image(orgSettings.logoUrl, 50, 45, { width: 50 });
        }

        doc.fillColor('#444444')
            .fontSize(20)
            .text(organization.name, 110, 50)
            .fontSize(10)
            .text((orgSettings?.address as string) || '', 110, 80)
            .text((orgSettings?.phone as string) || '', 110, 95)
            .moveDown();

        // Invoice Title
        doc.fillColor('#000000').fontSize(20).text('INVOICE', 50, 160);

        // Details
        const customer = order.customer;
        doc.fontSize(10)
            .text(`Invoice Number: ${order.externalId || order.id}`, 50, 200)
            .text(`Invoice Date: ${new Date().toLocaleDateString()}`, 50, 215)
            .text(
                `Order Date: ${order.createdAt.toLocaleDateString()}`,
                50,
                230
            )

            .text('Bill To:', 300, 200)
            .font('Helvetica-Bold')
            .text(customer.name, 300, 215)
            .font('Helvetica')
            .text(customer.email || '', 300, 230)
            .text(customer.phone || '', 300, 245)
            .text(customer.address || '', 300, 260);

        doc.moveDown(4);

        // Table
        const table = {
            title: '',
            headers: ['Item', 'Quantity', 'Price', 'Total'],
            rows: order.orderItems.map((item) => [
                item.product.name,
                item.quantity.toString(),
                `${item.price} ${order.currency}`,
                `${Number(item.price) * item.quantity} ${order.currency}`
            ])
        };

        doc.table(table, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
            prepareRow: () => doc.font('Helvetica').fontSize(10)
        });

        // Totals
        const subtotal = order.subtotal || 0;
        const tax = order.taxAmount || 0;
        const shipping = order.shippingAmount || 0;
        const total = order.totalAmount || 0;

        const startX = 350;
        let currentY = doc.y + 20;

        doc.text('Subtotal:', startX, currentY);
        doc.text(`${subtotal} ${order.currency}`, startX + 100, currentY, {
            align: 'right'
        });

        currentY += 15;
        doc.text('Tax:', startX, currentY);
        doc.text(`${tax} ${order.currency}`, startX + 100, currentY, {
            align: 'right'
        });

        currentY += 15;
        doc.text('Shipping:', startX, currentY);
        doc.text(`${shipping} ${order.currency}`, startX + 100, currentY, {
            align: 'right'
        });

        currentY += 20;
        doc.font('Helvetica-Bold')
            .text('Total:', startX, currentY)
            .text(`${total} ${order.currency}`, startX + 100, currentY, {
                align: 'right'
            });

        // Footer
        doc.fontSize(10)
            .font('Helvetica')
            .text('Thank you for your business!', 50, 700, {
                align: 'center',
                width: 500
            });

        doc.end();
    });
}
