<?php
declare(strict_types=1);

namespace Sms;

interface SmsDriver
{
    /** @param string $to E.164 digits without '+' (e.g. 9477xxxxxxx) */
    public function send(string $to, string $message): void;
}
