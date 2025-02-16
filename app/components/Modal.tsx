const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}
        onClick={onClose} // 背景クリックで閉じる
      >
        <div
          style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',      // 表示領域の最大高さを指定（画面高さの80%）
            overflowY: 'auto',      // 縦方向スクロールを有効化
          }}
          onClick={(e) => e.stopPropagation()} // 内部クリックで閉じないようにする
        >
          {children}
          <button
            onClick={onClose}
            style={{
              marginTop: '10px',
              display: 'block',
              marginLeft: 'auto',
              padding: '5px 10px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    );
  };
  
  export default Modal;
  