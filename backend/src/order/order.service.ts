import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(private prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto) {
    const { items, ...orderData } = createOrderDto;

    // Fetch customer upfront to denormalize city, name, phone into each order_detail
    const customer = await this.prisma.customer.findUnique({
      where: { id: orderData.customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Fetch all products in this order to denormalize name and category
    const productIds = items.map(item => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    // Calculate total amount from items
    const calculatedTotal = items.reduce((sum, item) => {
      return sum + (Number(item.unitCost) * item.quantity);
    }, 0);

    const order = await this.prisma.order.create({
      data: {
        customerId: orderData.customerId,
        orderAmount: new Prisma.Decimal(calculatedTotal),
        orderDate: orderData.orderDate,
        description: orderData.description,
        paymentMethod: orderData.paymentMethod,
        shippingAddress: orderData.shippingAddress,
        status: orderData.status || 'pending',
        items: {
          create: items.map(item => {
            const product = productMap.get(item.productId);
            return {
              product: { connect: { id: item.productId } },
              customerName: `${customer.firstName} ${customer.lastName}`,
              phoneNumber: customer.phone,
              productName: product?.name ?? '',
              category: product?.category ?? '',
              city: customer.city || orderData.shippingAddress || 'Unknown',
              unitCost: new Prisma.Decimal(item.unitCost),
              quantity: item.quantity,
              totalCost: new Prisma.Decimal(Number(item.unitCost) * item.quantity),
              paymentMethod: orderData.paymentMethod,
              status: orderData.status || 'pending',
              orderDate: orderData.orderDate,
            };
          })
        }
      },
      include: {
        customer: {
          select: { firstName: true, lastName: true }
        },
        items: {
          include: {
            product: { select: { name: true } }
          }
        }
      }
    }) as any; // Cast to any to bypass temporary type sync issues

    return {
      ...order,
      customerName: `${order.customer.firstName} ${order.customer.lastName}`,
      items: order.items.map((item: any) => ({
        ...item,
        productName: item.product.name
      }))
    };
  }

  async findAll() {
    try {
      const orders = await this.prisma.order.findMany({
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return orders.map((order) => ({
        id: order.id,
        customerId: order.customerId,
        customerName: order.customer
          ? `${order.customer.firstName} ${order.customer.lastName}`.trim()
          : 'Unknown Customer',
        orderNumber: order.orderNumber,
        orderAmount: String(order.orderAmount),
        orderDate: order.orderDate ? order.orderDate.toISOString() : null,
        description: order.description,
        paymentMethod: order.paymentMethod,
        shippingAddress: order.shippingAddress,
        status: order.status,
        createdAt: order.createdAt ? order.createdAt.toISOString() : null,
        updatedAt: order.updatedAt ? order.updatedAt.toISOString() : null,
        items: order.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName || (item.product?.name ?? 'Unnamed Product'),
          unitCost: String(item.unitCost),
          quantity: item.quantity,
          totalCost: String(item.totalCost),
        })),
      }));
    } catch (error) {
      this.logger.error(
        `Prisma orders read failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return [];
    }
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
          }
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                description: true,
                unitCost: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      id: order.id,
      customerId: order.customerId,
      customerName: `${order.customer.firstName} ${order.customer.lastName}`,
      orderNumber: order.orderNumber,
      orderAmount: order.orderAmount,
      orderDate: order.orderDate,
      description: order.description,
      paymentMethod: order.paymentMethod,
      shippingAddress: order.shippingAddress,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productDescription: item.product.description,
        productUnitCost: item.product.unitCost,
        unitCost: item.unitCost,
        quantity: item.quantity,
        totalCost: item.totalCost
      }))
    };
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const existingOrder = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      throw new NotFoundException('Order not found');
    }

    // Fetch customer upfront to denormalize city, name, phone into each updated order_detail
    const customerId = updateOrderDto.customerId ?? existingOrder.customerId;
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Calculate new total if items are being updated
    let calculatedTotal = existingOrder.orderAmount;
    let productMap = new Map<string, any>();

    if (updateOrderDto.items) {
      calculatedTotal = new Prisma.Decimal(
        updateOrderDto.items.reduce((sum, item) => {
          return sum + (Number(item.unitCost) * item.quantity);
        }, 0)
      );

      // Fetch products to denormalize name and category
      const productIds = updateOrderDto.items.map(item => item.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
      });
      productMap = new Map(products.map(p => [p.id, p]));
    }

    const paymentMethod = updateOrderDto.paymentMethod ?? existingOrder.paymentMethod;
    const status = updateOrderDto.status ?? existingOrder.status;
    const orderDate = updateOrderDto.orderDate ?? existingOrder.orderDate;

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        customerId,
        orderAmount: new Prisma.Decimal(calculatedTotal),
        orderDate,
        description: updateOrderDto.description,
        paymentMethod,
        shippingAddress: updateOrderDto.shippingAddress,
        status,
        ...(updateOrderDto.items && {
          items: {
            deleteMany: {},
            create: updateOrderDto.items.map(item => {
              const product = productMap.get(item.productId);
              return {
                product: { connect: { id: item.productId } },
                customerName: `${customer.firstName} ${customer.lastName}`,
                phoneNumber: customer.phone,
                productName: product?.name ?? '',
                category: product?.category ?? '',
                city: customer.city || updateOrderDto.shippingAddress || 'Unknown',
                unitCost: new Prisma.Decimal(item.unitCost),
                quantity: item.quantity,
                totalCost: new Prisma.Decimal(Number(item.unitCost) * item.quantity),
                paymentMethod,
                status,
                orderDate,
              };
            })
          }
        })
      },
      include: {
        customer: {
          select: { firstName: true, lastName: true }
        },
        items: {
          include: {
            product: { select: { name: true } }
          }
        }
      }
    }) as any;

    return {
      ...updatedOrder,
      customerName: `${updatedOrder.customer.firstName} ${updatedOrder.customer.lastName}`,
      items: updatedOrder.items.map((item: any) => ({
        ...item,
        productName: item.product.name
      }))
    };
  }

  async remove(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // First delete order items to maintain referential integrity
    await this.prisma.order_detail.deleteMany({
      where: { orderId: id }
    });

    // Then delete the order
    await this.prisma.order.delete({
      where: { id },
    });

    return { message: 'Order deleted successfully' };
  }
}