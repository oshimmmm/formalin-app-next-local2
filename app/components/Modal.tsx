const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="modal-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start', // centerからflex-startに変更
        paddingTop: '2rem',       // 上部に余白を追加
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="modal-content-print"
        style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '10px',
          maxWidth: '800px', // 幅を広げる
          width: '90%',
          maxHeight: '90vh',      // 80vhから90vhに変更
          overflowY: 'auto',
          margin: '0 auto',       // 追加
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hide-on-print flex justify-end gap-2 mb-4">
          <button
            onClick={handlePrint}
            style={{
              padding: '5px 10px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            この履歴を印刷
          </button>
        </div>
        {children}
        <button
          className="hide-on-print"
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
