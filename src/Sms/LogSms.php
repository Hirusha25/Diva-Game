<?php
declare(strict_types=1);

namespace Sms;

/** Development driver: appends messages to storage/sms.log instead of sending. */
final class LogSms implements SmsDriver
{
    public function send(string $to, string $message): void
    {
        $line = sprintf("[%s] to=%s %s\n", gmdate('c'), $to, $message);
        file_put_contents(DIVA_ROOT . '/storage/sms.log', $line, FILE_APPEND | LOCK_EX);
    }
}
