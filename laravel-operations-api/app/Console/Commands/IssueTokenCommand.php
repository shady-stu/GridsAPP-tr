<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Local development helper: prints a Sanctum personal access token for a seeded
 * user so the API can be exercised with curl without writing a login call first.
 *
 * Tokens are hashed at rest by Sanctum, so a token can never be recovered later;
 * issuing a new one here is the intended workaround.
 */
final class IssueTokenCommand extends Command
{
    protected $signature = 'grids:issue-token
                            {email : Email address of an existing user}
                            {--name=cli : Human readable name for the token}';

    protected $description = 'Issue a Sanctum API token for an existing user (development helper)';

    public function handle(): int
    {
        $email = (string) $this->argument('email');
        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $this->components->error(sprintf('No user found for [%s].', $email));

            return self::FAILURE;
        }

        $token = $user->createToken((string) $this->option('name'));

        $this->components->info(sprintf('Tenant: %s', (string) $user->tenant_id));
        $this->components->info(sprintf('Role: %s', $user->role->value));
        $this->newLine();
        $this->line($token->plainTextToken);

        return self::SUCCESS;
    }
}
