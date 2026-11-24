import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'حدث خطأ غير متوقع في التطبيق.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Khidmati ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#FAF9F6] text-[#0B172A] flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="font-display text-xl font-bold">
              تعذّر إكمال العملية المطلوبة
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              واجه النظام مشكلة أثناء معالجة البيانات أو صلاحيات الوصول. يمكنك
              إعادة تحميل الصفحة والمحاولة مجدداً.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold hover:bg-[#13233E]"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>إعادة تحميل الصفحة</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
