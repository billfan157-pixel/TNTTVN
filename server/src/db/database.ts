import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema.js'
import { client } from './connection.js'

export const db = drizzle(client, { schema })
