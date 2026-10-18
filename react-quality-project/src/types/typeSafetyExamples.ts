/**
 * AS CONST
 * Preserves literal values and makes properties readonly
 * in the inferred TypeScript type.
 */
export const API_STATUS = {
  SUCCESS: "success",
  ERROR: "error",
  LOADING: "loading",
} as const;

/**
 * SATISFIES
 * Checks compatibility with a required type while
 * preserving the inferred type of the expression.
 */
type SuccessResponse<T> = {
  status: "success";
  data: T;
};

export const userResponse = {
  status: "success",
  data: {
    id: "user-001",
    name: "Shady",
  },
} satisfies SuccessResponse<{
  id: string;
  name: string;
}>;
