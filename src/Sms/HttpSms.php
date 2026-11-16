<?php
declare(strict_types=1);

namespace Sms;

/**
 * Generic HTTP gateway driver. Covers Notify.lk, Dialog, Mobitel and most
 * local aggregators: set url, method and the params map in config
 * ('sms.http'); {to}, {message} and {sender} are substituted.
 */
final class HttpSms implements SmsDriver
{
    public function send(string $to, string $message): void
    {
        $c = cfg('sms.http');
        $vars = ['{to}' => $to, '{message}' => $message, '{sender}' => cfg('sms.sender')];
        $params = array_map(fn($v) => strtr((string) $v, $vars), $c['params'] ?? []);
        $url = $c['url'];
        $ch = curl_init();
        $headers = $c['headers'] ?? [];
        if (strtoupper($c['method'] ?? 'POST') === 'GET') {
            $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($params);
        } else {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        }
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false || $status >= 400) {
            throw new \RuntimeException("SMS gateway failed ($status): " . ($err ?: substr((string) $body, 0, 200)));
        }
    }
}
