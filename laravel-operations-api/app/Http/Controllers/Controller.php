<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

/**
 * Thin base controller: only the authorization helper is shared. Business logic
 * lives in Actions, not here.
 */
abstract class Controller
{
    use AuthorizesRequests;
}
