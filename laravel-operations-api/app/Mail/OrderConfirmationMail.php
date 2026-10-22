<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Only scalar order data is passed to the view: no customer PII is embedded in
 * the message body beyond the order the customer already owns, and nothing
 * secret can leak through a mail template.
 */
final class OrderConfirmationMail extends Mailable
{
    use Queueable;

    public function __construct(public readonly Order $order) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Order '.$this->order->number.' received',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.order-confirmation',
            with: [
                'orderNumber' => (string) $this->order->number,
                'orderTotal' => (string) $this->order->total,
                'orderCurrency' => (string) $this->order->currency,
                'orderStatus' => $this->order->status->value,
            ],
        );
    }
}
