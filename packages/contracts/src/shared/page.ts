import { z } from "zod4";

const MAX_CURSOR_LENGTH = 512;

export const cursorSchema = z
  .string()
  .min(1)
  .max(MAX_CURSOR_LENGTH)
  .refine((value) => value.trim().length > 0, {
    message: "Cursor must not be blank",
  })
  .refine((value) => !/\p{Cc}/u.test(value), {
    message: "Cursor must not contain control characters",
  })
  .brand<"OpaqueCursor">();

export const createCursorPageSchema = <ItemSchema extends z.ZodType>(
  itemSchema: ItemSchema,
) =>
  z
    .object({
      items: z.array(itemSchema),
      next_cursor: cursorSchema.nullable(),
    })
    .strict();

export type Cursor = z.infer<typeof cursorSchema>;
export interface CursorPage<Item> {
  items: Item[];
  next_cursor: Cursor | null;
}
