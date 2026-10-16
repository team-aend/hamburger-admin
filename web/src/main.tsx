import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ApiError } from './api/client';

dayjs.locale('ko');

// 세션이 끊기면(만료·중지·다른 곳에서 비밀번호 변경) 401, 임시 비밀번호 상태면 403 이 온다.
// 세션을 다시 확인해 로그인 화면이나 비밀번호 변경 화면으로 보낸다.
const onError = (error: unknown) => {
  if (error instanceof ApiError && (error.code === 'ADMIN_LOGIN_REQUIRED' || error.code === 'PASSWORD_CHANGE_REQUIRED')) {
    queryClient.invalidateQueries({ queryKey: ['session'] });
  }
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // 권한·입력 오류는 다시 시도해도 같으므로 재시도하지 않는다.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={koKR} theme={{ token: { colorPrimary: '#d4380d' } }}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
