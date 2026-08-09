import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  commonErrorResponses,
  createListResponseSchema,
  cursorQuerySchema,
  idempotencyHeaderSchema,
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
  versionStringSchema,
} from "./common.js";

const c = initContract();

const postPathSchema = z.object({ id: resourceIdSchema }).strict();
const publicationStatusSchema = z.enum([
  "reviewing",
  "published",
  "rejected",
  "hidden",
]);

export const postSchema = z
  .object({
    id: resourceIdSchema,
    author_id: resourceIdSchema,
    body: z.string().min(1).max(2_000),
    status: publicationStatusSchema,
    version: versionStringSchema,
    created_at: timestampSchema,
    viewer_liked: z.boolean(),
  })
  .strict();

export const commentSchema = z
  .object({
    id: resourceIdSchema,
    post_id: resourceIdSchema,
    author_id: resourceIdSchema,
    body: z.string().min(1).max(1_000),
    status: publicationStatusSchema,
    version: versionStringSchema,
    created_at: timestampSchema,
    viewer_liked: z.boolean(),
  })
  .strict();

export const contentSocialContract = c.router({
  postCreate: {
    method: "POST",
    path: "/v1/posts",
    headers: idempotencyHeaderSchema,
    body: z.object({ body: z.string().min(1).max(2_000) }).strict(),
    responses: {
      201: requestMetaSchema.extend({ post: postSchema }),
      ...commonErrorResponses,
    },
    summary: "Create a short post for review",
  },
  postGet: {
    method: "GET",
    path: "/v1/posts/:id",
    pathParams: postPathSchema,
    responses: {
      200: requestMetaSchema.extend({ post: postSchema }),
      ...commonErrorResponses,
    },
    summary: "Read a visible post",
  },
  commentList: {
    method: "GET",
    path: "/v1/posts/:id/comments",
    pathParams: postPathSchema,
    query: cursorQuerySchema,
    responses: {
      200: createListResponseSchema(commentSchema),
      ...commonErrorResponses,
    },
    summary: "List visible comments",
  },
  commentCreate: {
    method: "POST",
    path: "/v1/posts/:id/comments",
    pathParams: postPathSchema,
    headers: idempotencyHeaderSchema,
    body: z.object({ body: z.string().min(1).max(1_000) }).strict(),
    responses: {
      201: requestMetaSchema.extend({ comment: commentSchema }),
      ...commonErrorResponses,
    },
    summary: "Create a comment for review",
  },
  postPutLike: {
    method: "PUT",
    path: "/v1/posts/:id/reactions/like",
    pathParams: postPathSchema,
    body: z.object({}).strict(),
    responses: {
      200: requestMetaSchema.extend({ liked: z.literal(true) }),
      ...commonErrorResponses,
    },
    summary: "Idempotently like a post",
  },
  postDeleteLike: {
    method: "DELETE",
    path: "/v1/posts/:id/reactions/like",
    pathParams: postPathSchema,
    body: c.noBody(),
    responses: {
      200: requestMetaSchema.extend({ liked: z.literal(false) }),
      ...commonErrorResponses,
    },
    summary: "Idempotently remove the actor's post like",
  },
});
