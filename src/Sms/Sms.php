<?php
declare(strict_types=1);

namespace Sms;

final class Sms
{
    public static function driver(): SmsDriver
    {
        return match (cfg('sms.driver', 'log')) {
            'http'   => new HttpSms(),
            'twilio' => new TwilioSms(),
            default  => new LogSms(),
        };
    }

    public static function sendOtp(string $to, string $code): void
    {
        $msg = strtr(cfg('sms.template'), ['{code}' => $code, '{minutes}' => (string) intdiv((int) cfg('otp.ttl_seconds'), 60)]);
        self::driver()->send($to, $msg);
    }
}
