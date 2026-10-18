<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IssueTokenRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Token issuing for the stateless API (Laravel Sanctum personal access tokens).
 *
 * Laravel Sanctum is used as shipped: this controller only decides *who* gets a
 * token, never how a token is validated, stored or revoked.
 */
final class AuthController extends Controller
{
    public function store(IssueTokenRequest $request): JsonResponse
    {
        $user = User::query()->where('email', (string) $request->validated('email'))->first();

        // A single generic message: never reveal whether the email exists.
        if (! $user instanceof User || ! Hash::check((string) $request->validated('password'), (string) $user->password)) {
            throw ValidationException::withMessages([
                'email' => [__('These credentials do not match our records.')],
            ]);
        }

        $user->loadMissing('tenant');

        if ($user->tenant === null || ! $user->tenant->isActive()) {
            throw new AuthorizationException('This account is not attached to an active tenant.');
        }

        $token = $user->createToken((string) ($request->validated('device_name') ?? 'api-token'));

        return response()->json([
            'data' => [
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'user' => new UserResource($user),
            ],
        ], 201);
    }

    public function me(Request $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();
        $user->loadMissing('tenant');

        return new UserResource($user);
    }

    /**
     * Revokes only the token used for the current request, so other devices stay
     * signed in.
     */
    public function destroy(Request $request): Response
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->noContent();
    }
}
