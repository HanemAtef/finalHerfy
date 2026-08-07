import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-white shadow-sm border border-neutral my-6">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-xl font-bold text-textDark mb-2">حدث خطأ غير متوقع في هذه الصفحة</h2>
          <p className="text-sm text-textGray mb-4">
            {this.state.error?.message || 'تعذر تحميل الصفحة بشكل صحيح.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="btn-primary px-6 py-2 text-sm"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
