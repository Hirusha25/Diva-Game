<?php
declare(strict_types=1);

namespace Sms;

final class TwilioSms implements SmsDriver
{
    public function send(string $to, string $message): void
    {
        $c = cfg('sms.twilio');
        $ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$c['sid']}/Messages.json");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['To' => '+' . $to, 'From' => $c['from'], 'Body' => $message]),
            CURLOPT_USERPWD => $c['sid'] . ':' . $c['token'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($body === false || $status >= 400) {
            throw new \RuntimeException("Twilio failed ($status): " . substr((string) $body, 0, 200));
        }
    }
}
