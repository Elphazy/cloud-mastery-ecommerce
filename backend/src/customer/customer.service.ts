import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CustomerService {
  constructor(private prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    if (await this.findByEmail(createCustomerDto.email)) {
      throw new ConflictException('Customer exist');
    }
    const customer = await this.prisma.customer.create({
      data: {
        firstName: createCustomerDto.firstName,
        lastName: createCustomerDto.lastName,
        email: createCustomerDto.email,
        phone: createCustomerDto.phone,
        address: createCustomerDto.address,
        city: createCustomerDto.city,
      },
    });
    return customer;
  }

  async findAll() {
    return this.prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    const customer = this.prisma.customer.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException();
    }
    return customer;
  }

  async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException();
    }
    if (updateCustomerDto.email != customer.email) {
      if (await this.findByEmail(updateCustomerDto.email)) {
        throw new ConflictException('Customer exist');
      }
    }
    const updatedData = this.prisma.customer.update({
      where: { id },
      data: {  
        firstName: updateCustomerDto.firstName,
        lastName: updateCustomerDto.lastName,
        email: updateCustomerDto.email,
        phone: updateCustomerDto.phone,
        address: updateCustomerDto.address,
        city: updateCustomerDto.city},
    });
    return updatedData;
  }

  async remove(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException();
    }
    const deletedData = this.prisma.customer.delete({
      where: { id },
    });
    return deletedData;
  }

  async findByEmail(email: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { email },
    });

    return customer;
  }
}
