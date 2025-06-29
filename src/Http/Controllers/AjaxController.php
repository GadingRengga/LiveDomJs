<?php

namespace GadingRengga\LiveDomJS\Http\Controllers;


use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\View\View;
use Illuminate\Support\Facades\Log;
use Throwable;
use Illuminate\Routing\Controller;

class AjaxController extends Controller
{
    /**
     * Handle dynamic controller action calls via AJAX
     *
     * @param string $controller
     * @param string $action
     * @param Request $request
     * @return JsonResponse
     */
    public function handle(string $controller, string $action, Request $request): JsonResponse
    {
        try {
            // Validate controller and action names
            $this->validateInput($controller, $action);

            $controllerClass = $this->resolveControllerClass($controller);

            if (!class_exists($controllerClass) || !method_exists($controllerClass, $action)) {
                return $this->errorResponse('Controller or Action not found', 404);
            }

            $controllerInstance = app($controllerClass);
            $result = $controllerInstance->$action($request);

            return $this->handleSuccessResponse($result);
        } catch (Throwable $e) {
            Log::error('AjaxController Error', [
                'controller' => $controller,
                'action' => $action,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            if (config('app.debug')) {
                throw $e;
            }

            return $this->errorResponse('An error occurred while executing the action', 500, $e->getMessage());
        }
    }

    /**
     * Validate controller and action input
     *
     * @param string $controller
     * @param string $action
     * @throws \InvalidArgumentException
     */
    protected function validateInput(string $controller, string $action): void
    {
        if (!preg_match('/^[a-zA-Z0-9\/\.]+$/', $controller)) {
            throw new \InvalidArgumentException('Invalid controller name');
        }

        if (!preg_match('/^[a-zA-Z0-9]+$/', $action)) {
            throw new \InvalidArgumentException('Invalid action name');
        }
    }

    /**
     * Resolve controller class name
     *
     * @param string $controller
     * @return string
     */
    protected function resolveControllerClass(string $controller): string
    {
        $parts = preg_split('/[.\/]/', $controller);
        $normalized = array_map(function ($part) {
            return ucfirst(preg_replace('/[^a-zA-Z0-9]/', '', $part));
        }, $parts);

        return "App\\Http\\Controllers\\" . implode('\\', $normalized);
    }

    /**
     * Handle successful response
     *
     * @param mixed $result
     * @return JsonResponse
     */
    protected function handleSuccessResponse($result): JsonResponse
    {
        $response = [
            'success' => true,
            'message' => 'Controller and Action executed successfully',
        ];

        if ($result instanceof View) {
            $response['data'] = $result->render();
            $response['is_view'] = true;
        } else {
            $response['data'] = $result;
        }

        return response()->json($response);
    }

    /**
     * Generate error response
     *
     * @param string $message
     * @param int $status
     * @param string|null $errorDetail
     * @return JsonResponse
     */
    protected function errorResponse(string $message, int $status = 500, ?string $errorDetail = null): JsonResponse
    {
        $response = [
            'success' => false,
            'message' => $message,
        ];

        if ($errorDetail && config('app.debug')) {
            $response['error'] = $errorDetail;
        }

        return response()->json($response, $status);
    }
}
