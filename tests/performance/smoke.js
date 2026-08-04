import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const apiUrl = __ENV.API_URL || 'http://127.0.0.1:4000/api';

export const options = {
  vus: Number(__ENV.VUS || 2),
  duration: __ENV.DURATION || '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const storefront = http.get(`${baseUrl}/catalog`);
  check(storefront, { 'catalog is available': (response) => response.status === 200 });

  const health = http.get(`${apiUrl}/health/live`);
  check(health, { 'api is live': (response) => response.status === 200 });
}
