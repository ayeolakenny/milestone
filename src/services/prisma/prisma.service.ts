import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), '.env') });

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is missing.');
    }

    // sslmode=disable is used for the dockerized/local Postgres, which doesn't
    // speak SSL at all — anything else (managed DB, RDS, etc.) gets verified TLS.
    const sslRequired = !databaseUrl.includes('sslmode=disable');

    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: sslRequired ? { rejectUnauthorized: true } : false,
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    Logger.verbose('Database Connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
