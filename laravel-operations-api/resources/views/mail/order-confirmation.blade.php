<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Order {{ $orderNumber }}</title>
</head>
<body>
    <p>Hello,</p>

    <p>
        We have received your order <strong>{{ $orderNumber }}</strong> and it is
        currently <strong>{{ $orderStatus }}</strong>.
    </p>

    <p>
        Total: <strong>{{ $orderTotal }} {{ $orderCurrency }}</strong>
    </p>

    <p>Thank you for your business.</p>
</body>
</html>
