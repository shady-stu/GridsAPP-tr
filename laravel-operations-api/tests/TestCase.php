<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // The application already enables this outside production; asserting it
        // here documents that the test suite depends on it. Any accidental N+1
        // (a relationship touched after the parent model was loaded) becomes a
        // hard failure instead of a silently slower endpoint.
        Model::preventLazyLoading();
    }
}
